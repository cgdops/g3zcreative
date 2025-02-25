import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import MetaTags from '../common/MetaTags';
import { Box, Container, Typography, Button, Grid, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';

const HeroSection = styled(Box)(({ theme }) => ({
  background: '#f8f8f8',
  /*background: `linear-gradient(45deg, ${theme.palette.primary.main} 30%, ${theme.palette.secondary.main} 90%)`,*/
  color: 'black',
  padding: theme.spacing(15, 0),
  textAlign: 'center',
  '& h1': {
    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    fontWeight: 'bold',
    marginBottom: theme.spacing(3)
  }
}));

const ServiceCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  transition: 'transform 0.3s ease-in-out',
  '&:hover': {
    transform: 'translateY(-10px)'
  }
}));

function Home() {
  const services = [
    {
      title: 'Web Development',
      description: 'Custom, responsive websites that drive results',
      benefit: 'Boost Your Online Presence'
    },
    {
      title: 'SEO',
      description: 'Data-driven optimization for better visibility',
      benefit: 'Increase Your Traffic'
    },
    {
      title: 'Copywriting',
      description: 'Compelling content that converts',
      benefit: 'Engage Your Audience'
    },
    {
      title: 'Graphic Design',
      description: 'Visual elements that tell your story',
      benefit: 'Build a Memorable Brand'
    }
  ];

  return (
    <Box>
      <MetaTags
        title="Home"
        description="Transform your online presence with G3Z Creative's expert web development, SEO, copywriting, and design services. Schedule a free consultation today!"
      />
      <HeroSection>
        <Container>
          <Typography variant="h1" gutterBottom>
            Full-Service Web & Marketing Solutions to Elevate Your Brand
          </Typography>
          <Typography variant="h5" paragraph>
            Transform your online presence with expert web development, SEO, copywriting, and design services
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            href="https://calendar.app.google/S5f1g5313ZUninPR9"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ mt: 4 }}
          >
            Schedule a Free Consultation
          </Button>
        </Container>
      </HeroSection>

      <Container sx={{ py: 8 }}>
        <Typography variant="h2" align="center" gutterBottom>
          Our Services
        </Typography>
        <Grid container spacing={4} sx={{ mt: 4 }}>
          {services.map((service) => (
            <Grid item xs={12} sm={6} md={3} key={service.title}>
              <ServiceCard elevation={3}>
                <Typography variant="h5" gutterBottom>
                  {service.title}
                </Typography>
                <Typography color="textSecondary" paragraph>
                  {service.description}
                </Typography>
                <Typography variant="subtitle1" color="primary" sx={{ mt: 'auto' }}>
                  {service.benefit}
                </Typography>
              </ServiceCard>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            Ready to Grow Your Business?
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            component={RouterLink}
            to="/contact"
            sx={{ mt: 2 }}
          >
            Schedule a Free Consultation
          </Button>
        </Box>
      </Container>
    </Box>
  );
}

export default Home;